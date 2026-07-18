import { useState } from "react";
export function useBotWhatsapp() {
  const [estado] = useState({ conectado: false });
  return { estado };
}
