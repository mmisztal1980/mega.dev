// Which acts the agent may do alone. Set by the human for S02E05.
export const POLICY = {
  post_status: "free",
  ack_alert: "free",
  archive_report: "free",
  purge_cache: "free",
  release_hold: "gated",
  rotate_key: "gated",
};

// Find the act ids a message asks for. Unknown or no act -> gated (ask the human).
export function check(text) {
  const acts = [...new Set((text.match(/[a-z]+_[a-z]+/g) || []).filter((w) => w in POLICY))];
  if (acts.length === 0) return { acts, label: "gated" };
  const label = acts.some((a) => POLICY[a] === "gated") ? "gated" : "free";
  return { acts, label };
}
