/**
 * useAuth — estado de sesión del usuario.
 *
 * Extraído de main.tsx (P3 frontend). Sin cambios de comportamiento.
 * Mantiene: token en memoria (NO localStorage), currentUser, credenciales
 * del formulario de login, listas de usuarios/telegram targets, y los
 * handlers login/logout/refreshUsers/refreshTelegramTargets.
 *
 * El token se sincroniza con el módulo api vía setApiToken en un effect,
 * igual que en main.tsx original.
 */
import { useCallback, useEffect, useState } from "react";
import { api, setApiToken } from "../api";
import type { TelegramTarget, UserPublic } from "../types";

export type UseAuthReturn = {
  authToken: string;
  currentUser: UserPublic | null;
  loginEmail: string;
  loginPassword: string;
  showLoginPassword: boolean;
  authBusy: boolean;
  users: UserPublic[];
  telegramTargets: TelegramTarget[];
  isAdmin: boolean;
  setLoginEmail: (value: string) => void;
  setLoginPassword: (value: string) => void;
  setShowLoginPassword: (updater: (current: boolean) => boolean) => void;
  toggleShowPassword: () => void;
  login: (postLogin?: () => Promise<void>) => Promise<string | null>;
  logout: () => Promise<void>;
  refreshUsers: () => Promise<void>;
  refreshTelegramTargets: () => Promise<void>;
  setUsers: (users: UserPublic[]) => void;
  setTelegramTargets: (targets: TelegramTarget[]) => void;
};

export function useAuth(): UseAuthReturn {
  // Token lives in memory only — NOT in localStorage (XSS-robable).
  // The backend uses httpOnly cookies for auth; the token is kept in
  // state solely for stream URL authentication during this session.
  const [authToken, setAuthToken] = useState<string>("");
  const [currentUser, setCurrentUser] = useState<UserPublic | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPasswordState] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [users, setUsers] = useState<UserPublic[]>([]);
  const [telegramTargets, setTelegramTargets] = useState<TelegramTarget[]>([]);

  useEffect(() => {
    setApiToken(authToken);
    // Token is NOT persisted to localStorage — in-memory only for this session.
    // Clear any stale token from previous versions that did persist it.
    window.localStorage.removeItem("camcare_auth_token");
  }, [authToken]);

  const setShowLoginPassword = useCallback((updater: (current: boolean) => boolean) => {
    setShowLoginPasswordState((current) => updater(current));
  }, []);

  const toggleShowPassword = useCallback(() => {
    setShowLoginPasswordState((current) => !current);
  }, []);

  const refreshUsers = useCallback(async () => {
    if (!currentUser || currentUser.role !== "admin") return;
    const list = await api.users();
    setUsers(list);
  }, [currentUser]);

  const refreshTelegramTargets = useCallback(async () => {
    if (!currentUser || currentUser.role !== "admin") return;
    const rows = await api.telegramTargets();
    setTelegramTargets(rows);
  }, [currentUser]);

  useEffect(() => {
    void refreshUsers();
    void refreshTelegramTargets();
  }, [currentUser, refreshUsers, refreshTelegramTargets]);

  // Bootstrap: when a token appears, validate via /api/auth/me.
  // The postLogin callback lets App refresh cameras after a successful me().
  // We expose a stable login that returns a user-facing message (or null on
  // success) so App can set its global `message` state.
  const login = useCallback(
    async (postLogin?: () => Promise<void>): Promise<string | null> => {
      setAuthBusy(true);
      try {
        const res = await api.login(loginEmail.trim(), loginPassword);
        setAuthToken(res.token);
        setCurrentUser(res.user);
        setLoginPassword("");
        await postLogin?.();
        if (res.user.role === "admin") {
          await refreshUsers();
          await refreshTelegramTargets();
        }
        return `Sesión iniciada: ${res.user.email}`;
      } catch (err) {
        return err instanceof Error ? err.message : "login failed";
      } finally {
        setAuthBusy(false);
      }
    },
    [loginEmail, loginPassword, refreshUsers, refreshTelegramTargets],
  );

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // ignore logout transport errors
    }
    setCurrentUser(null);
    setUsers([]);
    setAuthToken("");
  }, []);

  // Validate token on change (mirrors original effect).
  useEffect(() => {
    if (!authToken) return;
    let cancelled = false;
    void api
      .me()
      .then((user) => {
        if (!cancelled) setCurrentUser(user);
      })
      .catch(() => {
        if (cancelled) return;
        setCurrentUser(null);
        setAuthToken("");
      });
    return () => {
      cancelled = true;
    };
  }, [authToken]);

  const isAdmin = currentUser?.role === "admin";

  return {
    authToken,
    currentUser,
    loginEmail,
    loginPassword,
    showLoginPassword,
    authBusy,
    users,
    telegramTargets,
    isAdmin,
    setLoginEmail,
    setLoginPassword,
    setShowLoginPassword,
    toggleShowPassword,
    login,
    logout,
    refreshUsers,
    refreshTelegramTargets,
    setUsers,
    setTelegramTargets,
  };
}