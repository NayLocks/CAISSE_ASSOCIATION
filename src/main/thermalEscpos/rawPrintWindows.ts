import { randomBytes } from 'crypto'
import { execFile } from 'child_process'
import { writeFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * Envoie des octets bruts (ESC/POS) au nom d’imprimante Windows via winspool (RAW).
 * Nécessite PowerShell (profil Windows normal).
 */
const PS_SCRIPT = String.raw`param(
  [Parameter(Mandatory=$true)][string]$PrinterNamePath,
  [Parameter(Mandatory=$true)][string]$DataPath
)
$ErrorActionPreference = 'Stop'
$printer = (Get-Content -LiteralPath $PrinterNamePath -Raw -Encoding UTF8).Trim()
if ($printer.Length -lt 1) { throw 'Nom d''imprimante vide' }
$bytes = [System.IO.File]::ReadAllBytes($DataPath)
$src = @'
using System;
using System.Runtime.InteropServices;

public static class RawPrintEscpos {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public struct DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }

  [DllImport("winspool.drv", CharSet = CharSet.Ansi, SetLastError = true)]
  public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);

  [DllImport("winspool.drv", CharSet = CharSet.Ansi, SetLastError = true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);

  [DllImport("winspool.drv", CharSet = CharSet.Ansi, SetLastError = true)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int Level, ref DOCINFOA pDocInfo);

  [DllImport("winspool.drv", CharSet = CharSet.Ansi, SetLastError = true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);

  [DllImport("winspool.drv", CharSet = CharSet.Ansi, SetLastError = true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.drv", CharSet = CharSet.Ansi, SetLastError = true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.drv", CharSet = CharSet.Ansi, SetLastError = true)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

  public static void Send(string printerName, byte[] bytes) {
    IntPtr h = IntPtr.Zero;
    if (!OpenPrinter(printerName, out h, IntPtr.Zero)) {
      throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "OpenPrinter");
    }
    try {
      DOCINFOA di = new DOCINFOA();
      di.pDocName = "ESC_POS";
      di.pOutputFile = null;
      di.pDataType = "RAW";
      if (!StartDocPrinter(h, 1, ref di)) {
        throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "StartDocPrinter");
      }
      try {
        if (!StartPagePrinter(h)) {
          throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "StartPagePrinter");
        }
        try {
          IntPtr p = Marshal.AllocCoTaskMem(bytes.Length);
          try {
            Marshal.Copy(bytes, 0, p, bytes.Length);
            int written;
            if (!WritePrinter(h, p, bytes.Length, out written)) {
              throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "WritePrinter");
            }
          } finally {
            Marshal.FreeCoTaskMem(p);
          }
        } finally {
          EndPagePrinter(h);
        }
      } finally {
        EndDocPrinter(h);
      }
    } finally {
      if (h != IntPtr.Zero) ClosePrinter(h);
    }
  }
}
'@
Add-Type -TypeDefinition $src -Language CSharp
[RawPrintEscpos]::Send($printer, $bytes)
`

export async function sendRawBytesToWindowsPrinter(
  printerName: string,
  data: Buffer
): Promise<{ ok: true } | { ok: false; error: string }> {
  const base = join(tmpdir(), `caisse-raw-${Date.now()}-${randomBytes(6).toString('hex')}`)
  const namePath = `${base}-printer.txt`
  const dataPath = `${base}.bin`
  const psPath = `${base}.ps1`
  try {
    writeFileSync(namePath, printerName, 'utf-8')
    writeFileSync(dataPath, data)
    writeFileSync(psPath, PS_SCRIPT, 'utf-8')
    await new Promise<void>((resolve, reject) => {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', psPath, namePath, dataPath],
        { windowsHide: true, timeout: 120_000, maxBuffer: 4 * 1024 * 1024 },
        (err, _stdout, stderr) => {
          if (err) {
            const msg = (stderr && String(stderr).trim()) || err.message || 'Impression RAW impossible.'
            reject(new Error(msg))
          } else resolve()
        }
      )
    })
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  } finally {
    for (const p of [namePath, dataPath, psPath]) {
      try {
        unlinkSync(p)
      } catch {
        /* ignore */
      }
    }
  }
}
