import type { RequestOptions } from "../core.js";
import { Resource } from "../resource.js";
import type { RequestBody } from "../types.js";

/**
 * The image {@link BrandLogo.upload} and {@link DomainUnsubscribePageLogo.upload}
 * send: PNG, JPEG or WebP, at most 2 MiB (the API judges the format from the
 * bytes; SVG is refused).
 */
export interface UploadLogoParams {
  /** The image: a `Blob` or `File`, or its bytes. */
  file: Blob | Uint8Array | ArrayBuffer;
  /**
   * The file name sent with the upload. A `File` keeps its own name; otherwise
   * the default is `logo.png`, `logo.jpg` or `logo.webp`, by what the bytes are.
   */
  filename?: string;
  /**
   * The content type of the part. A `Blob` or `File` keeps its own type;
   * otherwise it is judged from the bytes (`image/png`, `image/jpeg` or
   * `image/webp`).
   */
  contentType?: string;
}

const KINDS = [
  { type: "image/png", extension: "png" },
  { type: "image/jpeg", extension: "jpg" },
  { type: "image/webp", extension: "webp" },
] as const;

/** Which of the three accepted formats the first bytes are, by their magic numbers. */
function sniff(head: Uint8Array) {
  const at = (offset: number, ...bytes: number[]) => bytes.every((byte, i) => head[offset + i] === byte);
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return KINDS[0];
  if (at(0, 0xff, 0xd8, 0xff)) return KINDS[1];
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return KINDS[2];
  return undefined;
}

async function logoForm(params: UploadLogoParams): Promise<FormData> {
  const { file, filename, contentType } = params;
  let blob: Blob;
  let named: string | undefined;
  if (file instanceof Blob) {
    blob = file;
    if ("name" in file && typeof file.name === "string" && file.name !== "") named = file.name;
  } else {
    blob = new Blob([file as BlobPart]);
  }
  let type = contentType ?? blob.type;
  let kind: (typeof KINDS)[number] | undefined;
  if (type === "" || named === undefined) {
    kind = sniff(new Uint8Array(await blob.slice(0, 12).arrayBuffer()));
    if (type === "") type = kind?.type ?? "";
  }
  const form = new FormData();
  form.append(
    "file",
    type === blob.type ? blob : new Blob([blob], { type }),
    filename ?? named ?? `logo.${kind?.extension ?? "png"}`,
  );
  return form;
}

/** `/brand/logo`: the team's default logo. */
export class BrandLogo extends Resource {
  /**
   * `PUT /brand/logo`: uploads the team's logo (PNG, JPEG or WebP, at most 2 MiB)
   * as `multipart/form-data`. An upload is not repeated after a 5xx or a dropped
   * connection (a 429 is).
   */
  async upload(params: UploadLogoParams, options?: RequestOptions) {
    return this.core.request("put", "/brand/logo", {
      form: await logoForm(params),
      noRepeat: true,
      options,
    });
  }

  /** `DELETE /brand/logo` */
  delete(options?: RequestOptions) {
    return this.core.request("delete", "/brand/logo", { options });
  }
}

/** `/brand`: the team's default look for its recipient-facing pages. */
export class Brand extends Resource {
  readonly logo: BrandLogo = new BrandLogo(this.core);

  /** `GET /brand` */
  get(options?: RequestOptions) {
    return this.core.request("get", "/brand", { options });
  }

  /** `PATCH /brand`: fields not sent keep their value. */
  update(payload: RequestBody<"/brand", "patch">, options?: RequestOptions) {
    return this.core.request("patch", "/brand", { body: payload, options });
  }
}

/** `/domains/{id}/unsubscribe-page/logo`: one domain's own unsubscribe-page logo. */
export class DomainUnsubscribePageLogo extends Resource {
  /**
   * `PUT /domains/{id}/unsubscribe-page/logo`: uploads the domain's logo (PNG,
   * JPEG or WebP, at most 2 MiB) as `multipart/form-data`. An upload is not
   * repeated after a 5xx or a dropped connection (a 429 is).
   */
  async upload(id: string, params: UploadLogoParams, options?: RequestOptions) {
    return this.core.request("put", "/domains/{id}/unsubscribe-page/logo", {
      path: { id },
      form: await logoForm(params),
      noRepeat: true,
      options,
    });
  }

  /** `DELETE /domains/{id}/unsubscribe-page/logo` */
  delete(id: string, options?: RequestOptions) {
    return this.core.request("delete", "/domains/{id}/unsubscribe-page/logo", { path: { id }, options });
  }
}

export class DomainUnsubscribePage extends Resource {
  readonly logo: DomainUnsubscribePageLogo = new DomainUnsubscribePageLogo(this.core);
}
