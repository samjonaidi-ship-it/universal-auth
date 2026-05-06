// @samjonaidi-ship-it/universal-auth | scripts/verify-version-sync.ts | v1.0.0 | 2026-05-08 | BB
// CI gate: src/config.ts:SDK_VERSION literal MUST match package.json:version.
//
// Audit-fix 2026-05-08 (rc.5 lookback): rc.4 shipped with SDK_VERSION='1.1.0-rc.3'
// while package.json was '1.1.0-rc.4', causing every event envelope and outbound
// HTTP request to telemetry-misattribute as the previous version. Same class of
// regression as the v1.0.4 incident (was '1.0.2'). The 2026-05-04 fix was a
// docstring comment; this is the automation that prevents recurrence.
//
// Future P2-11 (auto-stamp via esbuild --define) supersedes this gate, but until
// that lands the literal-string approach + this CI check is the canonical guard.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

interface PackageJson {
  version: string;
}

function readPackageVersion(): string {
  const path = resolve(repoRoot, 'package.json');
  const json = JSON.parse(readFileSync(path, 'utf8')) as PackageJson;
  if (typeof json.version !== 'string' || json.version.length === 0) {
    throw new Error(`package.json:version missing or not a string`);
  }
  return json.version;
}

function readConfigSdkVersion(): { value: string; line: number } {
  const path = resolve(repoRoot, 'src/config.ts');
  const text = readFileSync(path, 'utf8');
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Match: export const SDK_VERSION = '...';
    const match = line.match(/^export\s+const\s+SDK_VERSION\s*=\s*['"]([^'"]+)['"]/);
    if (match) {
      return { value: match[1]!, line: i + 1 };
    }
  }
  throw new Error(`src/config.ts: could not locate SDK_VERSION export`);
}

function main(): void {
  const pkgVersion = readPackageVersion();
  const sdkVersion = readConfigSdkVersion();
  if (pkgVersion === sdkVersion.value) {
    console.log(
      `[verify-version-sync] OK — both at ${pkgVersion} ` +
        `(package.json + src/config.ts:${sdkVersion.line})`
    );
    process.exit(0);
  }
  console.error(
    `[verify-version-sync] MISMATCH:\n` +
      `  package.json:version       = ${pkgVersion}\n` +
      `  src/config.ts:SDK_VERSION  = ${sdkVersion.value} (line ${sdkVersion.line})\n\n` +
      `Bump src/config.ts:${sdkVersion.line} to '${pkgVersion}' to align.`
  );
  process.exit(1);
}

main();
