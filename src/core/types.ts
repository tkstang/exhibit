export type ArtifactType = 'markdown' | 'html';
export type ArtifactKind = 'artifact' | 'probe';

export interface Warning {
  readonly code: string;
  readonly message: string;
}

export interface Config {
  readonly schemaVersion: 1;
  readonly storage: {
    readonly provider: 's3';
    readonly bucket: string;
    readonly region: string;
    readonly prefix: string;
    readonly endpoint?: string;
    readonly forcePathStyle: boolean;
  };
  readonly publicBaseUrl: string;
  readonly maxInputBytes: number;
  readonly brand: { readonly name: string; readonly accent: string };
}

export interface RenderedArtifact {
  readonly html: string;
  readonly warnings: readonly Warning[];
}

export interface StoredArtifact {
  readonly slug: string;
  readonly key: string;
  readonly type: ArtifactType;
  readonly kind: ArtifactKind;
  readonly protected: boolean;
  readonly etag: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly size: number;
  readonly bodySha256: string;
  readonly contentType: string;
  readonly contentDisposition: string;
}

export interface PutArtifact {
  readonly slug: string;
  readonly body: string;
  readonly type: ArtifactType;
  readonly kind: ArtifactKind;
  readonly protected: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Absent means create-only, never an unconditional overwrite. */
  readonly expectedEtag?: string;
}

export interface ArtifactPage {
  readonly artifacts: readonly StoredArtifact[];
  readonly nextCursor: string | null;
}

export interface ArtifactStore {
  head(slug: string): Promise<StoredArtifact | null>;
  put(input: PutArtifact): Promise<StoredArtifact>;
  list(options: { readonly limit: number; readonly cursor?: string }): Promise<ArtifactPage>;
  remove(slug: string, etag: string): Promise<void>;
  checkAccess(): Promise<void>;
}

export interface PublicationReceipt {
  readonly schemaVersion: 1;
  readonly slug: string;
  readonly etag: string | null;
  readonly bodySha256: string;
  readonly status: 'prepared' | 'published';
  readonly url: string;
  readonly password: string | null;
  readonly savedAt: string;
}

export interface PublicationState {
  read(slug: string, bodySha256: string): Promise<PublicationReceipt | null>;
  save(receipt: PublicationReceipt): Promise<void>;
  remove(slug: string, bodySha256: string): Promise<void>;
}

export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };
