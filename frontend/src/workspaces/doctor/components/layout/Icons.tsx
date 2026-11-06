import { ClipboardIcon as SharedClipboardIcon } from '../../../../components/layout/Icons';

// One icon set for the whole app; re-exported here so this workspace's pages keep their original
// import paths.
export * from '../../../../components/layout/Icons';

// The doctor workspace uses the clipboard inline in buttons ("Order lab tests"), so it keeps the
// regular 20px size rather than the shared 32px. A local export takes precedence over `export *`.
export const ClipboardIcon = () => <SharedClipboardIcon size={20} />;
