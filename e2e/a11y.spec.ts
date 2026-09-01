import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";

/**
 * Milestone 7: a sweep of the invariants that make the app usable without a
 * mouse or without sight.
 *
 * These are computed from the live DOM rather than eyeballed, so a control
 * added later without a name fails here instead of shipping.
 */

type Finding = { what: string; detail: string };

/**
 * Collects accessibility problems from whatever is currently rendered.
 *
 * The accessible-name calculation is a deliberate approximation of the spec:
 * enough to catch the mistake that actually happens — an icon-only control
 * with nothing to announce.
 */
async function findProblems(page: Page, scope = "body"): Promise<Finding[]> {
  return page.evaluate((selector) => {
    const root = document.querySelector(selector);
    if (!root) return [{ what: "scope", detail: `no element matches ${selector}` }];

    const problems: { what: string; detail: string }[] = [];
    const visible = (element: Element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (
        rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none"
      );
    };

    /**
     * Whether assistive technology ever reaches this element.
     *
     * Base UI's Select renders a 1x1 input to carry the form value; it is
     * aria-hidden and tabindex=-1, so it is announced to nobody and reachable
     * by nobody. Flagging it would be flagging a correct implementation.
     *
     * role="img" makes its own subtree presentational, which is how a chart
     * offers one description instead of a pile of anonymous graphics.
     */
    const exposed = (element: Element) =>
      !element.closest("[aria-hidden='true']") &&
      !element.closest("[role='img']") &&
      !(element instanceof HTMLElement && element.tabIndex < 0 && element.matches("input"));

    const describe = (element: Element) =>
      `<${element.tagName.toLowerCase()}${
        element.id ? ` id="${element.id}"` : ""
      }> ${(element.textContent ?? "").trim().slice(0, 40)}`;

    const labelledBy = (element: Element) => {
      const ids = element.getAttribute("aria-labelledby");
      if (!ids) return "";
      return ids
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent ?? "")
        .join(" ")
        .trim();
    };

    const accessibleName = (element: Element): string => {
      const aria = element.getAttribute("aria-label")?.trim();
      if (aria) return aria;
      const byId = labelledBy(element);
      if (byId) return byId;
      const title = element.getAttribute("title")?.trim();
      if (title) return title;
      const text = (element.textContent ?? "").trim();
      if (text) return text;
      const image = element.querySelector("img[alt]");
      return image?.getAttribute("alt")?.trim() ?? "";
    };

    // 1. Every control announces something.
    for (const element of root.querySelectorAll("button, a[href], [role='button']")) {
      if (!visible(element) || !exposed(element)) continue;
      if (accessibleName(element) === "") {
        problems.push({ what: "control with no accessible name", detail: describe(element) });
      }
    }

    // 2. Every form control is labelled.
    for (const element of root.querySelectorAll("input, select, textarea")) {
      if (!visible(element) || !exposed(element)) continue;
      if ((element as HTMLInputElement).type === "hidden") continue;
      const id = element.getAttribute("id");
      const hasLabel = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
      const wrapped = element.closest("label");
      if (!hasLabel && !wrapped && accessibleName(element) === "") {
        problems.push({ what: "form control with no label", detail: describe(element) });
      }
    }

    // 3. aria-describedby must point at something that exists, or a screen
    //    reader is told to read an element that is not on the page.
    for (const element of root.querySelectorAll("[aria-describedby]")) {
      if (!exposed(element)) continue;
      for (const id of (element.getAttribute("aria-describedby") ?? "").split(/\s+/)) {
        if (id && !document.getElementById(id)) {
          problems.push({ what: "aria-describedby points at nothing", detail: `${describe(element)} -> #${id}` });
        }
      }
    }

    // 4. A decorative icon must be hidden, not read out as "graphic".
    for (const element of root.querySelectorAll("svg")) {
      if (!visible(element) || !exposed(element)) continue;
      const hidden = element.getAttribute("aria-hidden") === "true";
      const named = accessibleName(element) !== "" || element.getAttribute("role") === "img";
      if (!hidden && !named) {
        problems.push({ what: "svg neither hidden nor named", detail: describe(element.parentElement ?? element) });
      }
    }

    // 5. A positive tabindex reorders the keyboard path away from the visual
    //    one, which is disorienting for everyone using it.
    for (const element of root.querySelectorAll("[tabindex]")) {
      if (Number(element.getAttribute("tabindex")) > 0) {
        problems.push({ what: "positive tabindex", detail: describe(element) });
      }
    }

    return problems;
  }, scope);
}

const PAGES = ["/projects", "/clients", "/suppliers", "/finances"];

test.describe("accessibility", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  for (const path of PAGES) {
    test(`${path} announces every control and labels every field`, async ({ page }) => {
      await page.goto(path);
      await page.waitForTimeout(1200);
      expect(await findProblems(page)).toEqual([]);
    });
  }

  test("every page has exactly one h1 and the standard landmarks", async ({ page }) => {
    for (const path of PAGES) {
      await page.goto(path);
      await expect(page.locator("h1"), path).toHaveCount(1);
      await expect(page.getByRole("banner"), path).toHaveCount(1);
      await expect(page.getByRole("main"), path).toHaveCount(1);
      await expect(page.getByRole("navigation", { name: "Main" }), path).toHaveCount(1);
    }
  });

  test("dialogs are reachable and labelled", async ({ page }) => {
    for (const [path, trigger] of [
      ["/clients", "Add client"],
      ["/projects", "Add project"],
      ["/suppliers", "Add supplier"],
    ] as const) {
      await page.goto(path);
      await page.getByRole("button", { name: trigger }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog, path).toBeVisible();
      // A dialog with no name is announced as just "dialog".
      await expect(dialog, path).toHaveAccessibleName(new RegExp(trigger, "i"));
      expect(await findProblems(page, "[role='dialog']"), path).toEqual([]);
      await page.keyboard.press("Escape");
      await expect(dialog, path).toHaveCount(0);
    }
  });

  test("the whole add-client flow is reachable by keyboard alone", async ({ page }) => {
    await page.goto("/clients");
    await page.getByRole("button", { name: "Add client" }).focus();
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // Focus lands inside the dialog rather than being left on the page behind.
    await expect(dialog.getByLabel(/^Name/)).toBeFocused();

    await page.keyboard.type("E2E Keyboard Client");
    await expect(dialog.getByLabel(/^Name/)).toHaveValue("E2E Keyboard Client");

    // Escape closes it and returns focus to the control that opened it.
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add client" })).toBeFocused();
  });

  test("focus is visible on the controls a keyboard user lands on", async ({ page }) => {
    await page.goto("/clients");
    const search = page.getByLabel("Search clients");
    await search.focus();

    // Not merely "an outline exists" — the browser's default outline is
    // removed by the design system, so a visible ring has to replace it.
    const shadow = await search.evaluate((element) => getComputedStyle(element).boxShadow);
    expect(shadow).not.toBe("none");
  });
});
