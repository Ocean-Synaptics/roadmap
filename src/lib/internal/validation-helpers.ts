// Internal: Validation helper functions (not part of public API)

export function validateType(type: any): boolean {
  return type && typeof type === 'object';
}

export function validatePath(path: string): boolean {
  return typeof path === 'string' && path.length > 0;
}

export function validateRef(ref: string): boolean {
  return typeof ref === 'string' && ref.match(/^[a-z0-9-]+$/i);
}
