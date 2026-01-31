/* GWF d12 Reroll (Rue Only) for Foundry VTT v12 + dnd5e core rolls */

const CFG = {
  actorName: "Rue",
  dieFaces: 12,
  low: 2
};

function isDnd5eDamageMessage(message) {
  const dnd5e = message.flags?.dnd5e;
  if (!dnd5e) return false;
  if (dnd5e.messageType !== "roll") return false;
  if (dnd5e.roll?.type !== "damage") return false;
  return true;
}

function actorIdFromItemUuid(message) {
  const uuid = message.flags?.dnd5e?.item?.uuid;
  // Example: Actor.Nrh2UoJky0POpiu9.Item.fy0oagBB9SLops4F
  if (!uuid) return null;
  const m = /^Actor\.([^.]+)\.Item\./.exec(uuid);
  return m?.[1] ?? null;
}

function getActorForMessage(message) {
  const actorId = actorIdFromItemUuid(message);
  if (actorId) return game.actors?.get(actorId) ?? null;

  const spk = message.speaker;
  if (spk?.actor) return game.actors?.get(spk.actor) ?? null;

  const scene = game.scenes?.get(spk?.scene) ?? canvas?.scene ?? null;
  const tokenDoc = scene?.tokens?.get(spk?.token) ?? null;
  return tokenDoc?.actor ?? null;
}

function hasLowD12(roll) {
  if (!roll) return false;
  for (const die of (roll.dice ?? [])) {
    if (die?.faces !== CFG.dieFaces) continue;
    for (const r of (die.results ?? [])) {
      if (r?.active === false) continue;
      const val = Number(r?.result);
      if (Number.isFinite(val) && val <= CFG.low) return true;
    }
  }
  return false;
}

function addRerollOnceToD12(formula) {
  // Add reroll-once for results <=2 to each d12 term.
  // Leave other dice (d8, d6, etc) untouched.
  return String(formula).replace(/d12(?![a-zA-Z])/g, "d12ro<=2");
}

function injectButton(html, message, rollIndex) {
  const btn = $(
    `<button type="button" class="gwf-d12-rue-btn" style="margin-top:6px;">
      GWF: Reroll 1–2 (d12)
    </button>`
  );

  btn.on("click", async (ev) => {
    ev.preventDefault();
    btn.prop("disabled", true);

    try {
      const baseRoll = message.rolls?.[rollIndex];
      if (!baseRoll) return;

      const newFormula = addRerollOnceToD12(baseRoll.formula);
      const newRoll = await (new Roll(newFormula, baseRoll.data)).evaluate({ async: true });

      const flavorBase = message.flavor ?? "Damage Roll";
      const flavor = `${flavorBase} | GWF reroll once on d12 results 1–2`;

      await newRoll.toMessage({
        speaker: message.speaker,
        flavor,
        flags: {
          "gwf-d12-rue": {
            sourceMessageId: message.id,
            applied: true
          }
        }
      });
    } catch (err) {
      console.error("gwf-d12-rue | reroll failed", err);
      ui.notifications?.error("GWF reroll failed. Check console (F12).");
    } finally {
      btn.prop("disabled", false);
    }
  });

  const target =
    html.find(".dice-total").last().parent().length
      ? html.find(".dice-total").last().parent()
      : html;

  target.append(btn);
}

Hooks.on("renderChatMessage", (message, html) => {
  if (!isDnd5eDamageMessage(message)) return;

  const actor = getActorForMessage(message);
  if (!actor) return;

  // Only affect Rue
  if (actor.name !== CFG.actorName && message.speaker?.alias !== CFG.actorName) return;

  // Only show to the logged-in user who owns Rue, and not to a GM account
  if (!actor.testUserPermission(game.user, "OWNER")) return;
  if (game.user?.isGM) return;

  const rolls = message.rolls ?? [];
  if (!rolls.length) return;

  // Only target rolls that include d12 and actually rolled 1 or 2 on a d12.
  let targetIndex = -1;
  for (let i = 0; i < rolls.length; i++) {
    const r = rolls[i];
    if (!/d12/.test(r.formula)) continue;
    if (!hasLowD12(r)) continue;
    targetIndex = i;
    break;
  }
  if (targetIndex === -1) return;

  // Avoid duplicates on rerender
  if (html.find(".gwf-d12-rue-btn").length) return;

  injectButton(html, message, targetIndex);
});
