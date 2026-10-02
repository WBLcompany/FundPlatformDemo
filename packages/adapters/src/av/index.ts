import net from "node:net";

/** Quarantine → scan → tenant path (architecture §8). */
export type ScanResult = "clean" | "infected";
export interface VirusScanner { readonly name: string; scan(body: Uint8Array): Promise<ScanResult> }

const EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

/** Dev/test scanner: flags the EICAR test string only. */
export class MockScanner implements VirusScanner {
  readonly name = "av-mock";
  async scan(body: Uint8Array) { return Buffer.from(body).toString("latin1").includes(EICAR) ? "infected" : "clean"; }
}

/** clamd INSTREAM over TCP. */
export class ClamdScanner implements VirusScanner {
  readonly name = "av-clamd";
  constructor(private readonly host: string, private readonly port = 3310, private readonly timeoutMs = 30_000) {}
  scan(body: Uint8Array): Promise<ScanResult> {
    return new Promise((resolve, reject) => {
      const sock = net.createConnection({ host: this.host, port: this.port });
      let out = "";
      sock.setTimeout(this.timeoutMs, () => { sock.destroy(); reject(new Error("clamd timeout")); });
      sock.on("connect", () => {
        sock.write("zINSTREAM\0");
        for (let i = 0; i < body.length; i += 64 * 1024) {
          const chunk = body.subarray(i, i + 64 * 1024);
          const len = Buffer.alloc(4); len.writeUInt32BE(chunk.length);
          sock.write(len); sock.write(chunk);
        }
        sock.write(Buffer.alloc(4));
      });
      sock.on("data", (d) => { out += d.toString(); });
      sock.on("end", () => resolve(/FOUND/.test(out) ? "infected" : "clean"));
      sock.on("error", reject);
    });
  }
}
