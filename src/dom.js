// Small DOM helpers. They use the document only when called, so importing this module touches no DOM.
export function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
export function button(text, action, className = 'btn') {
  const node = element('button', text, className);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}
export function option(text, value) {
  const node = element('option', text);
  node.value = value;
  return node;
}
export function notice(target, message, error = false) {
  target.textContent = message;
  target.className = `alert ${error ? 'alert-danger' : 'alert-info'} text-pre-wrap text-break d-print-none`;
  target.hidden = !message;
}
export function download(blob, name) {
  const url = URL.createObjectURL(blob), link = element('a');
  link.href = url; link.download = name;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
