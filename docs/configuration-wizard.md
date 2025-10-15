# Configuration Wizard

The `eddie config` command launches an interactive questionnaire that guides you
through selecting presets and recording the minimal overrides needed for your
project. It is the fastest way to scaffold an `eddie.config.(yaml|json)` file
without memorising every configuration key.

## When to use it

Use the wizard when you are bootstrapping a new repository or want to explore
what each preset enables. It produces a config file inside the configured
`CONFIG_ROOT` (defaults to `<project>/config/`) so the rest of the CLI can pick
it up immediately.

## Running the wizard

```bash
npm exec -- eddie config
```

You will be asked to:

1. Choose a preset (e.g. `cli-local` for richer local logging). Select `None`
   to start from the built-in defaults.
2. Pick a file format (`eddie.config.yaml` or `eddie.config.json`).
3. Confirm the project directory, default model, and provider values.

The wizard merges the selected preset with your overrides and writes the result
via `ConfigService.writeSource`, so the generated file is immediately valid and
usable. The command prints the full path after writing so you can inspect or
commit it.

## Customising the output location

By default the wizard writes to `<repo>/config/eddie.config.yaml`. Override the
location for a single run by setting `CONFIG_ROOT` before launching the
command:

```bash
CONFIG_ROOT=. npm exec -- eddie config
```

This writes directly to `./eddie.config.yaml`, which is helpful when you prefer
to keep configuration in the repository root.

## Iterating on the config

The wizard intentionally creates a minimal file. You can run it again at any
time—existing files will be overwritten with the newly selected preset and
answers. Afterwards, continue to edit the file by hand to add tools, providers,
or any of the other configuration keys documented in [README.md](../README.md).
