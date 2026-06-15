export class ProfileNotFoundError extends Error {
  constructor() {
    super("Profile not found");
    this.name = "ProfileNotFoundError";
  }
}

export class ProfileValidationError extends Error {
  constructor(details) {
    super("Profile is invalid");
    this.name = "ProfileValidationError";
    this.details = details;
  }
}

export class ProfileConflictError extends Error {
  constructor(profile) {
    super("Profile revision conflict");
    this.name = "ProfileConflictError";
    this.profile = profile;
  }
}

export class ProfileStorageError extends Error {
  constructor(message = "Profile storage is unavailable") {
    super(message);
    this.name = "ProfileStorageError";
  }
}

