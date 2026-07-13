const MAX_REASON_LENGTH = 1000;
const VISIBLE_CHARACTER = /[\p{L}\p{N}\p{P}\p{S}]/u;
const PROHIBITED_CHARACTER = /[\p{Cc}\p{Cf}]/u;

interface ValidReason {
  ok: true;
  value: string;
}

interface InvalidReason {
  ok: false;
  kind: "required" | "invalid";
}

export type ReasonValidationResult = ValidReason | InvalidReason;

export function validateReason(reason: string): ReasonValidationResult {
  const value = reason.normalize("NFC").trim();

  if (!value) {
    return { ok: false, kind: "required" };
  }

  if (value.length > MAX_REASON_LENGTH) {
    return { ok: false, kind: "invalid" };
  }

  for (const character of value) {
    if (
      character !== "\t" &&
      character !== "\n" &&
      character !== "\r" &&
      PROHIBITED_CHARACTER.test(character)
    ) {
      return { ok: false, kind: "invalid" };
    }
  }

  if (!VISIBLE_CHARACTER.test(value)) {
    return { ok: false, kind: "invalid" };
  }

  return { ok: true, value };
}
