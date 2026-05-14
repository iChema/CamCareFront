import { useState } from "react";
import type { TelegramTarget } from "../types";
import { Panel, SectionTitle } from "./ui";

type Props = {
  telegramTargets: TelegramTarget[];
  busy: string;
  onCreate: (payload: { name: string; chat_id: string; active: boolean }) => Promise<void>;
  onUpdate: (target: TelegramTarget, patch: Partial<TelegramTarget>) => Promise<void>;
  onDelete: (target: TelegramTarget) => Promise<void>;
};

export function TelegramTargetsPage({ telegramTargets, busy, onCreate, onUpdate, onDelete }: Props) {
  const [rows, setRows] = useState<TelegramTarget[]>(telegramTargets);
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState("");
  const [chatId, setChatId] = useState("");
  const [active, setActive] = useState(true);

  if (rows !== telegramTargets) {
    const sameLen = rows.length === telegramTargets.length;
    const sameIds = sameLen && rows.every((row, index) => row.id === telegramTargets[index]?.id);
    if (!sameIds) setRows(telegramTargets);
  }

  async function createRow() {
    await onCreate({ name: name.trim(), chat_id: chatId.trim(), active });
    setName("");
    setChatId("");
    setActive(true);
    setShowAddModal(false);
  }

  return (
    <Panel id="telegram">
      <SectionTitle title="Destinos Telegram" meta={`${telegramTargets.length} destinos`} />
      <div className="actions">
        <button className="secondary" disabled={busy === "tg-create"} onClick={() => setShowAddModal(true)}>
          Agregar destino Telegram
        </button>
      </div>
      <div className="table-wrap">
        <table className="simple-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Nombre</th>
              <th>Chat ID</th>
              <th>Activo</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((target) => (
              <tr key={`tg-${target.id}`}>
                <td>{target.id}</td>
                <td>
                  <input
                    value={target.name}
                    onChange={(event) =>
                      setRows((current) =>
                        current.map((item) => (item.id === target.id ? { ...item, name: event.target.value } : item)),
                      )
                    }
                  />
                </td>
                <td>
                  <input
                    value={target.chat_id}
                    onChange={(event) =>
                      setRows((current) =>
                        current.map((item) => (item.id === target.id ? { ...item, chat_id: event.target.value } : item)),
                      )
                    }
                  />
                </td>
                <td>
                  <select
                    value={target.active ? "yes" : "no"}
                    onChange={(event) =>
                      setRows((current) =>
                        current.map((item) => (item.id === target.id ? { ...item, active: event.target.value === "yes" } : item)),
                      )
                    }
                  >
                    <option value="yes">Sí</option>
                    <option value="no">No</option>
                  </select>
                </td>
                <td>
                  <div className="row-actions">
                    <button className="secondary" disabled={busy === `tg-${target.id}`} onClick={() => void onUpdate(target, target)}>
                      Guardar
                    </button>
                    <button className="danger" disabled={busy === `tg-del-${target.id}`} onClick={() => void onDelete(target)}>
                      Borrar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showAddModal && (
        <div className="modal-backdrop" role="presentation" onClick={() => setShowAddModal(false)}>
          <div className="modal-card" role="dialog" aria-modal="true" aria-label="Agregar destino Telegram" onClick={(event) => event.stopPropagation()}>
            <SectionTitle title="Nuevo destino Telegram" />
            <div className="form-grid settings-grid">
              <label>
                Nombre
                <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Chema personal" />
              </label>
              <label>
                Chat ID
                <input value={chatId} onChange={(event) => setChatId(event.target.value)} placeholder="136859922 o -100..." />
              </label>
              <label>
                Activo
                <select value={active ? "yes" : "no"} onChange={(event) => setActive(event.target.value === "yes")}>
                  <option value="yes">Sí</option>
                  <option value="no">No</option>
                </select>
              </label>
            </div>
            <div className="actions">
              <button className="secondary" onClick={() => setShowAddModal(false)}>Cancelar</button>
              <button className="primary" disabled={busy === "tg-create"} onClick={() => void createRow()}>Agregar</button>
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}
