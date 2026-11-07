import { useMemo } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  CellStyleModule,
  ClientSideRowModelModule,
  ColumnAutoSizeModule,
  ModuleRegistry,
  ValidationModule,
  themeQuartz,
} from "ag-grid-community";
import { ArrowRight, CheckCircle, Clock, HandHeart, UsersThree } from "@phosphor-icons/react";

ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  ColumnAutoSizeModule,
  CellStyleModule,
  ValidationModule,
]);

const trustPalTheme = themeQuartz.withParams({
  accentColor: "#0967f2",
  backgroundColor: "#ffffff",
  borderColor: "#e4eaf2",
  borderRadius: 14,
  browserColorScheme: "light",
  cellHorizontalPadding: 18,
  fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui",
  fontSize: 14,
  foregroundColor: "#101936",
  headerBackgroundColor: "#f8faff",
  headerFontSize: 13,
  headerFontWeight: 650,
  headerTextColor: "#5d6780",
  oddRowBackgroundColor: "#ffffff",
  rowBorder: true,
  rowHoverColor: "#f8fbff",
  spacing: 8,
  wrapperBorder: false,
});

const money = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function CreatorBadge({ data }) {
  return data.creatorType === "ngo" ? (
    <span className="badge ngo-badge"><CheckCircle size={15} weight="fill" /> Verified NGO</span>
  ) : (
    <span className="badge creator-badge"><UsersThree size={15} weight="fill" /> Creator Level · {data.points.toLocaleString()} Trust Points</span>
  );
}

function CauseCell({ data }) {
  return (
    <div className="cause-cell">
      <img src={data.image} alt="" />
      <div className="cause-cell-copy">
        <strong>{data.title}</strong>
        <span className="creator-name">{data.creator}</span>
        <CreatorBadge data={data} />
        <span className="cause-description">{data.description}</span>
        {data.creatorType === "creator" ? <span className="disclosure">{data.supportType}</span> : null}
      </div>
    </div>
  );
}

function FundingCell({ data }) {
  const percent = Math.min(100, Math.round((data.raised / data.goal) * 100));
  return (
    <div className="funding-cell">
      <strong>{money.format(data.raised)} <span>of {money.format(data.goal)}</span></strong>
      <div className="progress-track" aria-label={`${percent}% funded`}>
        <span style={{ width: `${percent}%` }} />
      </div>
      <small>{percent}% funded</small>
      <span className={data.urgencyDays <= 18 ? "urgency urgent" : "urgency"}>
        <Clock size={15} weight="bold" /> {data.urgencyText}
      </span>
    </div>
  );
}

function SkillCell({ data }) {
  return (
    <div className="skill-cell">
      <span><UsersThree size={18} /> Skill need</span>
      <strong>{data.skillNeed}</strong>
      <small>{data.location}</small>
    </div>
  );
}

function ActionsCell({ data, context }) {
  if (!data.recipientReady) {
    return (
      <div className="cause-actions pending-actions">
        <button className="secondary-button compact" disabled>PayPal review pending</button>
        <button className="secondary-button compact" onClick={() => context.onSkill(data)}>
          <HandHeart size={17} /> Offer a skill
        </button>
      </div>
    );
  }
  return (
    <div className="cause-actions">
      <button className="primary-button compact" onClick={() => context.onDonate(data)}>
        Donate with PayPal
      </button>
      <button className="secondary-button compact" onClick={() => context.onSkill(data)}>
        <HandHeart size={17} /> Offer a skill
      </button>
    </div>
  );
}

export function CauseGrid({ rows, onDonate, onSkill }) {
  const columnDefs = useMemo(() => [
    { headerName: "Cause", field: "title", cellRenderer: CauseCell, minWidth: 560, flex: 2.25, sortable: true },
    { headerName: "Funding", field: "raised", cellRenderer: FundingCell, minWidth: 240, flex: 1, sortable: true },
    { headerName: "Needs now", field: "skillNeed", cellRenderer: SkillCell, minWidth: 240, flex: 1, sortable: true },
    { headerName: "Contribute", cellRenderer: ActionsCell, minWidth: 230, flex: 0.9, sortable: false },
  ], []);

  return (
    <div className="cause-grid" aria-label="Cause explorer">
      <AgGridReact
        theme={trustPalTheme}
        rowData={rows}
        columnDefs={columnDefs}
        context={{ onDonate, onSkill }}
        rowHeight={154}
        headerHeight={42}
        domLayout="autoHeight"
        suppressCellFocus={false}
        animateRows={true}
        getRowId={({ data }) => data.id}
        defaultColDef={{ resizable: true }}
      />
    </div>
  );
}

export function ViewAllButton({ expanded, onClick, total }) {
  return (
    <button className="view-all" onClick={onClick}>
      {expanded ? "Show featured causes" : `View all ${total} causes`}
      <ArrowRight size={18} weight="bold" />
    </button>
  );
}

