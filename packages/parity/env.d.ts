// Only what the config reads, so the package needs no @types/node.
declare const process: { env: Record<string, string | undefined> };
