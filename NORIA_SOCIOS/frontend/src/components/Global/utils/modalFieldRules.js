const TEXT_INPUT_TYPES = new Set([
  "",
  "email",
  "number",
  "password",
  "search",
  "tel",
  "text",
  "url",
]);

const UNRESTRICTED_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "date",
  "datetime-local",
  "file",
  "hidden",
  "month",
  "radio",
  "range",
  "reset",
  "submit",
  "time",
  "week",
]);

const FIELD_RULES = {
  "person-name": {
    maxLength: 120,
    pattern: "[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' .-]{1,120}",
    title: "Ingresá solamente letras y separadores válidos para el nombre.",
    sanitize: personNameOnly,
  },
  dni: {
    maxLength: 9,
    minLength: 6,
    inputMode: "numeric",
    pattern: "[0-9]{6,9}",
    title: "Ingresá un DNI de 6 a 9 números.",
    sanitize: digitsOnly,
  },
  "tax-id": {
    maxLength: 11,
    minLength: 11,
    inputMode: "numeric",
    pattern: "[0-9]{11}",
    title: "Ingresá los 11 números del CUIT o CUIL.",
    sanitize: digitsOnly,
  },
  phone: {
    maxLength: 20,
    inputMode: "tel",
    pattern: "[0-9+(). \\-]{6,20}",
    title: "Ingresá entre 6 y 20 caracteres válidos para el teléfono.",
    sanitize: phoneOnly,
  },
  email: {
    maxLength: 254,
    inputMode: "email",
    pattern: "[^\\s@]+@[^\\s@]+\\.[^\\s@]+",
    title: "Ingresá un email válido.",
    sanitize: emailOnly,
  },
  integer: {
    maxLength: 10,
    inputMode: "numeric",
    pattern: "[0-9]+",
    title: "Ingresá solamente números enteros.",
    sanitize: digitsOnly,
  },
  decimal: {
    maxLength: 15,
    inputMode: "decimal",
    pattern: "[0-9]{1,12}([.,][0-9]{1,2})?",
    title: "Ingresá un número válido con hasta 2 decimales.",
    sanitize: positiveDecimal,
  },
  percentage: {
    maxLength: 6,
    inputMode: "decimal",
    pattern: "(100([.,]0{1,2})?|[0-9]{1,2}([.,][0-9]{1,2})?)",
    title: "Ingresá un porcentaje entre 0 y 100.",
    sanitize: percentage,
  },
  year: {
    maxLength: 4,
    minLength: 4,
    inputMode: "numeric",
    pattern: "[0-9]{4}",
    title: "Ingresá un año de 4 números.",
    sanitize: digitsOnly,
  },
  age: {
    maxLength: 3,
    inputMode: "numeric",
    pattern: "(120|1[01][0-9]|[0-9]{1,2})",
    title: "Ingresá una edad válida entre 0 y 120.",
    sanitize: digitsOnly,
  },
};

const EXPLICIT_RULE_ALIASES = {
  cuit: "tax-id",
  cuil: "tax-id",
  telefono: "phone",
  celular: "phone",
  correo: "email",
  numero: "integer",
  cantidad: "integer",
  importe: "decimal",
  monto: "decimal",
  precio: "decimal",
  porcentaje: "percentage",
  anio: "year",
  nombre: "person-name",
  apellido: "person-name",
};

function personNameOnly(value) {
  return String(value ?? "").replace(/[^\p{L}\p{M}' .-]/gu, "");
}

function digitsOnly(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function phoneOnly(value) {
  const clean = String(value ?? "")
    .replace(/[^0-9+().\-\s]/g, "")
    .replace(/(?!^)\+/g, "");
  return clean.replace(/\s{2,}/g, " ");
}

function emailOnly(value) {
  return String(value ?? "").replace(/\s/g, "");
}

function positiveDecimal(value) {
  const clean = String(value ?? "").replace(/[^0-9.,]/g, "");
  const separatorIndexes = [...clean.matchAll(/[.,]/g)].map(
    (match) => match.index,
  );
  if (!separatorIndexes.length) return clean;

  const decimalSeparatorIndex = separatorIndexes[separatorIndexes.length - 1];
  const decimalPart = clean
    .slice(decimalSeparatorIndex + 1)
    .replace(/[.,]/g, "");
  if (decimalPart.length > 2) return clean.replace(/[.,]/g, "");

  const integerPart = clean
    .slice(0, decimalSeparatorIndex)
    .replace(/[.,]/g, "");
  const separator = clean[decimalSeparatorIndex];
  return `${integerPart}${separator}${decimalPart}`;
}

function percentage(value) {
  const clean = positiveDecimal(value);
  const numeric = Number(clean.replace(",", "."));
  if (!Number.isFinite(numeric) || numeric <= 100) return clean;
  return "100";
}

function normalizeDescriptor(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-AR")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isEditableField(element) {
  if (!element || typeof element.matches !== "function") return false;
  if (element.matches("textarea")) return true;
  if (!element.matches("input")) return false;
  const type = String(element.type || "text").toLowerCase();
  return TEXT_INPUT_TYPES.has(type) && !UNRESTRICTED_INPUT_TYPES.has(type);
}

function fieldDescriptor(element) {
  const label = element.closest("label");
  return normalizeDescriptor(
    [
      element.name,
      element.id,
      element.getAttribute("aria-label"),
      element.getAttribute("autocomplete"),
      element.getAttribute("placeholder"),
      label?.textContent,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function explicitRule(element) {
  const requested = normalizeDescriptor(element.dataset.fieldType);
  if (!requested) return null;
  if (["none", "off", "free", "free text", "text"].includes(requested)) {
    return "none";
  }
  return EXPLICIT_RULE_ALIASES[requested] || requested.replace(/\s+/g, "-");
}

function inferredRule(element) {
  const descriptor = fieldDescriptor(element);
  const inputType = String(element.type || "").toLowerCase();

  if (inputType === "search" || /\b(buscar|busqueda|filtro)\b/.test(descriptor)) {
    return null;
  }
  if (inputType === "email") return "email";
  if (inputType === "tel") return "phone";
  if (/\b(cuit|cuil|clave tributaria)\b/.test(descriptor)) return "tax-id";
  if (/\b(dni|documento de identidad)\b/.test(descriptor)) return "dni";
  if (/\b(telefono|celular|whatsapp|movil)\b/.test(descriptor)) return "phone";
  if (/\b(email|e mail|correo electronico)\b/.test(descriptor)) return "email";
  if (/^(porcentaje|descuento|recargo|interes)(\b| )/.test(descriptor)) {
    return "percentage";
  }
  if (/^(importe|monto|precio|saldo|valor)(\b| )/.test(descriptor)) {
    return "decimal";
  }
  if (/^edad(\b| )/.test(descriptor)) return "age";
  if (/^anio(\b| )/.test(descriptor)) return "year";
  if (/^(cantidad|cuotas?|meses?|unidades?)(\b| )/.test(descriptor)) {
    return "integer";
  }
  return null;
}

function setAttribute(element, name, value) {
  if (value === undefined || value === null || value === "") return;
  element.setAttribute(name, String(value));
}

function setDefaultLength(element) {
  if (element.hasAttribute("maxlength")) return;
  const type = String(element.type || "text").toLowerCase();
  const defaultLength = element.matches("textarea")
    ? 5000
    : type === "url"
      ? 2048
      : type === "password"
        ? 128
        : type === "search"
          ? 150
          : 255;
  setAttribute(element, "maxlength", defaultLength);
}

export function configureModalField(element) {
  if (!isEditableField(element)) return null;

  const requestedRule = explicitRule(element);
  const ruleName =
    requestedRule === "none" ? null : requestedRule || inferredRule(element);
  const rule = ruleName ? FIELD_RULES[ruleName] : null;

  if (!rule) {
    setDefaultLength(element);
    return null;
  }

  setAttribute(element, "maxlength", rule.maxLength);
  setAttribute(element, "minlength", rule.minLength);
  setAttribute(element, "inputmode", rule.inputMode);
  setAttribute(element, "pattern", rule.pattern);
  setAttribute(element, "title", rule.title);
  element.dataset.globalFieldRule = ruleName;
  return { name: ruleName, ...rule };
}

export function configureModalFields(container) {
  if (!container?.querySelectorAll) return;
  container.querySelectorAll("input, textarea").forEach(configureModalField);
}

export function restrictModalField(event) {
  const element = event?.target;
  if (!isEditableField(element) || event?.nativeEvent?.isComposing) return;

  const rule = configureModalField(element);
  if (!rule?.sanitize) return;

  const previousValue = element.value;
  const nextValue = rule.sanitize(previousValue).slice(0, rule.maxLength);
  if (previousValue === nextValue) return;

  const selectionStart = element.selectionStart;
  const previousPrefix =
    typeof selectionStart === "number"
      ? previousValue.slice(0, selectionStart)
      : null;
  element.value = nextValue;

  if (
    previousPrefix !== null &&
    typeof element.setSelectionRange === "function"
  ) {
    const nextCaret = Math.min(
      rule.sanitize(previousPrefix).length,
      nextValue.length,
    );
    try {
      element.setSelectionRange(nextCaret, nextCaret);
    } catch {
      // Algunos tipos de input no permiten controlar la selección.
    }
  }
}

export const modalFieldRules = Object.freeze({ ...FIELD_RULES });
