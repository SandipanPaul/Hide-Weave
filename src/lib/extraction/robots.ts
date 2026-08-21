/**
 * Just enough of the robots exclusion standard to be a good citizen.
 *
 * Pure and offline: the caller fetches robots.txt, this decides what it means.
 * When a site says no, we do not fetch its pages — that is the whole point of
 * checking first.
 */

export type RobotsRule = { allow: boolean; path: string };
export type RobotsGroup = { agents: string[]; rules: RobotsRule[] };

/**
 * Parses robots.txt into its user-agent groups.
 *
 * Consecutive `User-agent` lines share the rules that follow them, which is
 * how the standard groups agents, and comments and unknown directives are
 * ignored rather than treated as rules.
 */
export function parseRobots(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  // A new User-agent after a rule starts a new group; before one, it joins.
  let collectingAgents = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split("#")[0].trim();
    if (line === "") continue;

    const separator = line.indexOf(":");
    if (separator === -1) continue;

    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === "user-agent") {
      if (!current || !collectingAgents) {
        current = { agents: [], rules: [] };
        groups.push(current);
        collectingAgents = true;
      }
      current.agents.push(value.toLowerCase());
    } else if (field === "allow" || field === "disallow") {
      if (!current) continue;
      collectingAgents = false;
      // "Disallow:" with no value means everything is allowed, so it is not a
      // rule at all.
      if (field === "disallow" && value === "") continue;
      current.rules.push({ allow: field === "allow", path: value });
    }
  }

  return groups;
}

/** The group for this agent, falling back to the wildcard group. */
function groupFor(groups: RobotsGroup[], userAgent: string): RobotsGroup | null {
  const agent = userAgent.toLowerCase();
  const named = groups.find((group) =>
    group.agents.some((candidate) => candidate !== "*" && agent.includes(candidate)),
  );
  return named ?? groups.find((group) => group.agents.includes("*")) ?? null;
}

/** Matches robots.txt path patterns, including `*` and an end-anchoring `$`. */
function matches(pattern: string, path: string): boolean {
  if (pattern === "") return false;

  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;

  const escaped = body
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");

  return new RegExp(`^${escaped}${anchored ? "$" : ""}`).test(path);
}

/**
 * Whether this path may be fetched.
 *
 * Absent or unreadable robots.txt means yes — that is what the standard says,
 * and it is what every crawler does. The longest matching rule wins, and an
 * Allow beats a Disallow of the same length.
 */
export function isAllowed(robotsTxt: string | null, path: string, userAgent: string): boolean {
  if (!robotsTxt || robotsTxt.trim() === "") return true;

  const group = groupFor(parseRobots(robotsTxt), userAgent);
  if (!group) return true;

  let best: { rule: RobotsRule; length: number } | null = null;
  for (const rule of group.rules) {
    if (!matches(rule.path, path)) continue;
    const length = rule.path.replace(/\$$/, "").length;
    if (!best || length > best.length || (length === best.length && rule.allow)) {
      best = { rule, length };
    }
  }

  return best ? best.rule.allow : true;
}
