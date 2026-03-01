// CLI exit code definitions — standardized across all commands
export const EXIT_SUCCESS = 0;          // Command succeeded
export const EXIT_USER_ERROR = 1;       // User error (invalid args, missing node, etc.)
export const EXIT_SYSTEM_ERROR = 2;     // System error (file I/O, parsing, etc.)
export const EXIT_PERMISSION_ERROR = 3; // Permission/state error (claim conflict, DAG corruption, etc.)
export const EXIT_VALIDATION_ERROR = 4; // Validation rule failed (artifact missing, shell command failed, etc.)

export function getExitCode(error: any): number {
  if (!error) return EXIT_SUCCESS;
  if (error.code === 'ENOENT' || error.code === 'EISDIR') return EXIT_SYSTEM_ERROR;
  if (error.code === 'EACCES') return EXIT_PERMISSION_ERROR;
  if (error.message?.includes('not found')) return EXIT_USER_ERROR;
  if (error.message?.includes('claimed by')) return EXIT_PERMISSION_ERROR;
  if (error.message?.includes('Validation failed')) return EXIT_VALIDATION_ERROR;
  return EXIT_SYSTEM_ERROR;
}
