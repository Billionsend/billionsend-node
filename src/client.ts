import { type BillionSendOptions, Core } from "./core.js";
import {
  Agent,
  ApiKeys,
  Deliverability,
  Domains,
  Logs,
  OauthGrants,
  Usage,
  Webhooks,
} from "./resources/account.js";
import { Automations, Events } from "./resources/automations.js";
import { Brand } from "./resources/brand.js";
import { Broadcasts, Templates } from "./resources/broadcasts.js";
import { Audiences, ContactProperties, Contacts, Segments, Topics } from "./resources/contacts.js";
import { Emails } from "./resources/emails.js";
import { Inboxes } from "./resources/inboxes.js";
import { Suppressions, Unsubscribes, Verifications } from "./resources/lists.js";

/**
 * The BillionSend API client.
 *
 * ```ts
 * const bs = new BillionSend("bs_...");
 * const { data, error } = await bs.emails.send({ from, to, subject, html });
 * ```
 *
 * Every method resolves to `{ data, error, headers }` and never rejects.
 */
export class BillionSend {
  readonly emails: Emails;
  readonly domains: Domains;
  readonly apiKeys: ApiKeys;
  readonly contacts: Contacts;
  readonly audiences: Audiences;
  readonly contactProperties: ContactProperties;
  readonly segments: Segments;
  readonly topics: Topics;
  readonly broadcasts: Broadcasts;
  readonly templates: Templates;
  readonly webhooks: Webhooks;
  readonly suppressions: Suppressions;
  readonly unsubscribes: Unsubscribes;
  readonly verifications: Verifications;
  readonly usage: Usage;
  readonly deliverability: Deliverability;
  readonly inboxes: Inboxes;
  readonly agent: Agent;
  readonly automations: Automations;
  readonly events: Events;
  readonly logs: Logs;
  readonly oauthGrants: OauthGrants;
  readonly brand: Brand;

  readonly #core: Core;

  /**
   * @param apiKeyOrOptions An API key (`bs_...`), or options. Without a key the
   *   client reads `BILLIONSEND_API_KEY`; only `agent.signup` works with no key at all.
   */
  constructor(apiKeyOrOptions?: string | BillionSendOptions) {
    const options: BillionSendOptions =
      typeof apiKeyOrOptions === "string" ? { apiKey: apiKeyOrOptions } : { ...apiKeyOrOptions };
    const core = new Core(options);
    this.#core = core;
    this.emails = new Emails(core);
    this.domains = new Domains(core);
    this.apiKeys = new ApiKeys(core);
    this.contacts = new Contacts(core);
    this.audiences = new Audiences(core);
    this.contactProperties = new ContactProperties(core);
    this.segments = new Segments(core);
    this.topics = new Topics(core);
    this.broadcasts = new Broadcasts(core);
    this.templates = new Templates(core);
    this.webhooks = new Webhooks(core);
    this.suppressions = new Suppressions(core);
    this.unsubscribes = new Unsubscribes(core);
    this.verifications = new Verifications(core);
    this.usage = new Usage(core);
    this.deliverability = new Deliverability(core);
    this.inboxes = new Inboxes(core);
    this.agent = new Agent(core);
    this.automations = new Automations(core);
    this.events = new Events(core);
    this.logs = new Logs(core);
    this.oauthGrants = new OauthGrants(core);
    this.brand = new Brand(core);
  }

  /** The API base URL this client calls. */
  get baseUrl(): string {
    return this.#core.baseUrl;
  }
}
