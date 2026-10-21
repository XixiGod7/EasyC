import { Container } from "@cloudflare/containers";
import { authorizeRequest, type AccessSecrets } from "./auth";

interface Env extends AccessSecrets {
  EASYC_CONTAINER: DurableObjectNamespace<EasyCContainer>;
}

export class EasyCContainer extends Container<Env> {
  defaultPort = 7860;
  sleepAfter = "2m";
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const challenge = await authorizeRequest(request, env);
    if (challenge) return challenge;

    // Keep Gradio's event queue and in-memory settings on the same instance.
    const container = env.EASYC_CONTAINER.get(env.EASYC_CONTAINER.idFromName("easyc"));
    const headers = new Headers(request.headers);
    // The Python app and submitted C programs never receive the access password.
    headers.delete("Authorization");
    return container.fetch(new Request(request, { headers }));
  },
} satisfies ExportedHandler<Env>;
