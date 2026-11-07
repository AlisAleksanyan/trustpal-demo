import { CaretDown } from "@phosphor-icons/react";

export function Header({ view, onNavigate }) {
  const links = [
    ["discover", "Discover"],
    ["command", "Live impact"],
    ["steward", "Steward Console"],
    ["impact", "My impact"],
    ["create", "Create a cause"],
  ];

  return (
    <header className="app-header">
      <button className="brand" onClick={() => onNavigate("discover")} aria-label="TrustPal home">
        <span>Trust</span><strong>Pal</strong>
      </button>
      <nav className="main-nav" aria-label="Primary navigation">
        {links.map(([id, label]) => (
          <button
            key={id}
            className={view === id ? "nav-link active" : "nav-link"}
            onClick={() => onNavigate(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <button className="profile-menu" onClick={() => onNavigate("impact")} aria-label="Open Maya's profile">
        <img src="/assets/causes/maya-study.jpg" alt="Maya Chen" />
        <CaretDown size={18} weight="bold" />
      </button>
    </header>
  );
}

