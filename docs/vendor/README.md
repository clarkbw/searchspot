This is for any libraries we import from other sources so we can an easy way to diff against our own custom versions.

 * `simple-storage` was modified to purge when unlaoded with the `disabled` reason.  Otherwise the storage is never purged
 * `panel` was modified in two ways.
   * `autocomplete-panel` removes the arrow panel specific pieces and forces a display location
   * `permission-panel` sets the `noautohide` attribute to `true` so the panel is required to be dismissed by the user
