// observability control: structured, single-line JSON logs to stdout. Deliberately not a logging
// framework — a platform's log collector (docker logs, journald, a cloud log sink) reads stdout
// either way, and a JSON line is enough to filter/alert on without adding a dependency.
type Fields = Record<string, unknown>;

function emit(level: "info" | "warn" | "error", event: string, fields: Fields = {}) {
  console.log(JSON.stringify({ level, event, time: new Date().toISOString(), ...fields }));
}

export const log = {
  info: (event: string, fields?: Fields) => emit("info", event, fields),
  warn: (event: string, fields?: Fields) => emit("warn", event, fields),
  error: (event: string, fields?: Fields) => emit("error", event, fields),
};
