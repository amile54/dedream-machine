import { resolveWorkspacePath } from '../stores/projectStore';

export function getOriginalVideoCandidate(
  workspace: string | null,
  videoFilePath: string | undefined,
): string | null {
  if (!workspace || !videoFilePath) return null;
  return resolveWorkspacePath(workspace, videoFilePath);
}

export async function ensureOriginalVideoAvailable(
  workspace: string | null,
  videoFilePath: string | undefined,
  checkExists: (path: string) => Promise<boolean>,
  onMissing: (missingPath: string) => Promise<string | null>,
): Promise<string | null> {
  const candidate = getOriginalVideoCandidate(workspace, videoFilePath);
  if (!candidate) return null;

  if (await checkExists(candidate)) {
    return candidate;
  }

  return onMissing(candidate);
}
