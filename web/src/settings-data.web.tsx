// Wraps the offline settings "data" section and adds the Google Drive panel above it.
// The offline file is not modified: vite.config.ts swaps this module in for the web build only.
import type { ComponentProps } from "react";
import { DataSection as OfflineDataSection } from "../../src/features/settings-data";
import { CloudSection } from "./cloud-panel";

export * from "../../src/features/settings-data";

export function DataSection(props: ComponentProps<typeof OfflineDataSection>) {
  return (
    <>
      <CloudSection {...props} />
      <OfflineDataSection {...props} />
    </>
  );
}
