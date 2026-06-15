(function initializeAdapterRegistry(global) {
  const namespace = (global.FormAutoFill = global.FormAutoFill || {});
  const core = namespace.core;

  const ADAPTERS = [
    namespace.GoogleFormsAdapter,
    namespace.MicrosoftFormsAdapter,
  ].filter(Boolean);

  function createAdapter(document, location) {
    const Adapter =
      ADAPTERS.find((Candidate) => Candidate.detect(document, location)) ||
      ADAPTERS.find((Candidate) => Candidate.supportsLocation?.(location));

    if (!Adapter) {
      throw new core.FormAdapterError(
        "UNSUPPORTED_FORM",
        "This page is not a recognized Google Form or Microsoft Form",
      );
    }

    return new Adapter(document, location);
  }

  function isSupportedForm(document, location) {
    return ADAPTERS.some((Adapter) => Adapter.detect(document, location));
  }

  function isSupportedLocation(location) {
    return ADAPTERS.some((Adapter) => Adapter.supportsLocation?.(location));
  }

  namespace.adapterRegistry = {
    createAdapter,
    isSupportedForm,
    isSupportedLocation,
  };
})(globalThis);
