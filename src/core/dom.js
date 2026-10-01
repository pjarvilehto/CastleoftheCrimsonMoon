// core/dom.js — el(tag, attrs, ...children), the one DOM builder every
// screen uses (0.117: moved out of core/scene.js). attrs: class, on<event>
// handlers, key / key2 hotkeys (core/hotkeys.js clicks the button), and any
// other attribute; false/null/undefined attrs and children are skipped.

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v === null || v === undefined) continue; // boolean attrs: false/absent = not set
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'key') node.setAttribute('data-key', String(v).toLowerCase());
    // Secondary hotkey (e.g. Space for Push Deeper). No label underline —
    // it's a hidden convenience binding, not advertised on the button.
    else if (k === 'key2') node.setAttribute('data-key2', String(v).toLowerCase());
    else node.setAttribute(k, v === true ? '' : v);
  }
  // Hotkey affordance: underline the first occurrence of the key letter
  // in the label (e.g. "<u>A</u>ttack").
  if (attrs.key) {
    const k = String(attrs.key).toLowerCase();
    for (let i = 0; i < children.length; i++) {
      if (typeof children[i] === 'string') {
        const idx = children[i].toLowerCase().indexOf(k);
        if (idx !== -1) {
          const s = children[i];
          children.splice(i, 1,
            s.slice(0, idx),
            el('u', {}, s.slice(idx, idx + 1)),
            s.slice(idx + 1));
          break;
        }
      }
    }
  }
  const content = children.flat();
  if (tag === 'button') {
    // Buttons are flex-centered (styles.css), and flex trims whitespace
    // around anonymous text items — the underline splice splits "Drink
    // Potion" into "Drink " + <u>p</u> + "otion", losing the space
    // ("DRINKPOTION", 0.050). A span wrapper keeps the label one inline
    // context where the space survives.
    node.append(el('span', { class: 'btn-label' }, ...content));
    return node;
  }
  for (const child of content) {
    if (child === null || child === undefined || child === false) continue; // conditional children
    node.append(child instanceof Node ? child : document.createTextNode(child));
  }
  return node;
}
