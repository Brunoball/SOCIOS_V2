import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faComments, faReceipt, faTags, faUsers, faWallet } from "@fortawesome/free-solid-svg-icons";
import "./Dashboard.css";

const cards = [
  { title: "Socios activos", value: "0", subtitle: "Base lista para comenzar", icon: faUsers },
  { title: "Cuotas del período", value: "0", subtitle: "Sin cuotas generadas", icon: faReceipt },
  { title: "Categorías", value: "0", subtitle: "Sin categorías configuradas", icon: faTags },
  { title: "Saldo contable", value: "$ 0,00", subtitle: "Sin movimientos registrados", icon: faWallet },
];

export default function Dashboard() {
  return (
    <section className="dashbord-page">
      <header className="dashbord-header">
        <div className="dashbord-header__title">
          <h1>Panel de Gestión de Socios</h1>
          <p>Resumen general y punto de entrada a los módulos del nuevo sistema.</p>
        </div>
        <div className="dashbord-header__tools"><span className="dashbord-chip">Base inicial</span></div>
      </header>

      <div className="dashbord-layout">
        <section className="dashbord-cards dashbord-cards--top">
          {cards.map((card) => (
            <article className="dashbord-card" key={card.title}>
              <div className="dashbord-card__icon"><FontAwesomeIcon icon={card.icon} /></div>
              <div className="dashbord-card__body"><span className="dashbord-card__title">{card.title}</span><strong>{card.value}</strong><small>{card.subtitle}</small></div>
            </article>
          ))}
        </section>

        <div className="dashbord-mainGrid">
          <article className="dashbord-panel dashbord-panel--chart">
            <div className="dashbord-panel__head"><div><h2>Estructura preparada</h2><p>El frontend quedó desacoplado de la lógica académica y listo para conectar los nuevos endpoints.</p></div></div>
            <div className="dashbord-emptyChart"><FontAwesomeIcon icon={faUsers} /><strong>Próximo paso: definir la base de datos</strong><span>Luego se implementan autenticación, socios, familias, cuotas, categorías, contabilidad y WhatsApp en ese orden.</span></div>
          </article>
          <article className="dashbord-panel">
            <div className="dashbord-panel__head"><div><h2>Panel de bot</h2><p>Espacio reservado para integración con WhatsApp.</p></div></div>
            <div className="dashbord-emptyChart"><FontAwesomeIcon icon={faComments} /><strong>Integración pendiente</strong><span>La estructura visual ya está creada; todavía no se conecta ninguna API externa.</span></div>
          </article>
        </div>
      </div>
    </section>
  );
}
