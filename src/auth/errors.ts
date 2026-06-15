export enum UserErrorCode {
  EMAIL_TAKEN = 'EMAIL_TAKEN',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  WEAK_PASSWORD = 'WEAK_PASSWORD',
  FORBIDDEN = 'FORBIDDEN',
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  CANNOT_DEMOTE_SELF = 'CANNOT_DEMOTE_SELF',
  CANNOT_DEACTIVATE_SELF = 'CANNOT_DEACTIVATE_SELF',
  INVALID_INPUT = 'INVALID_INPUT',
}

export class UserError extends Error {
  public readonly code: UserErrorCode;
  constructor(code: UserErrorCode, message: string) {
    super(message);
    this.name = 'UserError';
    this.code = code;
  }
  toGraphQLFormat(): { message: string; extensions: { code: string } } {
    return { message: this.message, extensions: { code: this.code } };
  }
}
