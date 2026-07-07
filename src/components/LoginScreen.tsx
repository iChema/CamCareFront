/**
 * LoginScreen — early-return de login del componente App.
 *
 * Extraído de main.tsx para reducir el tamaño del componente App.
 * Toda la lógica de autenticación (login, token, busy) vive en App;
 * este componente es puramente presentacional y recibe callbacks.
 */
import { Eye, EyeOff } from "lucide-react";

type Props = {
  loginEmail: string;
  loginPassword: string;
  showLoginPassword: boolean;
  authBusy: boolean;
  message: string;
  isLoginError: (message: string) => boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onToggleShowPassword: () => void;
  onSubmit: () => void;
};

export function LoginScreen({
  loginEmail,
  loginPassword,
  showLoginPassword,
  authBusy,
  message,
  isLoginError,
  onEmailChange,
  onPasswordChange,
  onToggleShowPassword,
  onSubmit,
}: Props) {
  return (
    <main className="login-shell">
      <section className="login-card">
        <h1>CamCare Login</h1>
        <p>Ingresa con tu cuenta para acceder a cámaras y configuración.</p>
        <label>
          Email
          <input value={loginEmail} onChange={(event) => onEmailChange(event.target.value)} />
        </label>
        <label>
          Password
          <div className="password-field">
            <input
              type={showLoginPassword ? "text" : "password"}
              value={loginPassword}
              onChange={(event) => onPasswordChange(event.target.value)}
            />
            <button
              type="button"
              className="icon-btn"
              onClick={onToggleShowPassword}
              title={showLoginPassword ? "Ocultar password" : "Mostrar password"}
            >
              {showLoginPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </label>
        <button className="primary" disabled={authBusy} onClick={onSubmit}>
          {authBusy ? "Entrando..." : "Iniciar sesión"}
        </button>
        {message && <div className={`message ${isLoginError(message) ? "error" : ""}`}>{message}</div>}
      </section>
    </main>
  );
}