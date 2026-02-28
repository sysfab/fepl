import { getBackend, type Backend, type BackendRegistry } from "./backend";
import { jsBackend } from "./js";
import { pythonBackend } from "./python";

export const backends: BackendRegistry = {
    [jsBackend.id]: jsBackend,
    [pythonBackend.id]: pythonBackend,
};

export type BackendId = keyof typeof backends;

export function resolveBackend(id: string): Backend {
    return getBackend(backends, id);
}
