import { render, screen } from "@testing-library/react";
import App from "./App";

jest.mock("./components/Global/auth/centralAuth", () => ({
  initializeCentralSession: () => new Promise(() => {}),
}));

test("espera la validación de la sesión emitida por SAAS_LOGIN", () => {
  render(<App />);
  expect(screen.getByText(/Validando sesión/i)).toBeInTheDocument();
});
