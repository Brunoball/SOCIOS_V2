import React from "react";

const WIDTH_SEQUENCE = [64, 78, 52, 70, 58, 82, 46, 68];

const normalizeColumn = (column) =>
  String(
    typeof column === "string"
      ? column
      : column?.label || column?.title || column?.key || "",
  )
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-AR");

const inferCellType = (column, index) => {
  const label = normalizeColumn(column);
  if (/accion|opcion|herramienta/.test(label)) return "actions";
  if (/estado|situacion/.test(label)) return "chip";
  if (/contacto|socio|persona|nombre/.test(label) || index === 0) {
    return "stacked";
  }
  return "line";
};

function SkeletonLine({ width, secondary = false, delay = 0 }) {
  return (
    <span
      className={`mov-skeletonBar${secondary ? " mov-skeletonBar--secondary" : ""}`}
      style={{
        "--global-skeleton-width": `${width}%`,
        "--global-skeleton-delay": `${delay}ms`,
      }}
    />
  );
}

function SkeletonCell({ type, width, actionCount, delay }) {
  if (type === "actions") {
    return (
      <div className="mov-skelActions">
        {Array.from({ length: actionCount }, (_, index) => (
          <span
            className="mov-skelIcon"
            key={index}
            style={{ "--global-skeleton-delay": `${delay + index * 45}ms` }}
          />
        ))}
      </div>
    );
  }

  if (type === "chip") {
    return (
      <span
        className="mov-skeletonBar mov-skeletonBar--chip"
        style={{ "--global-skeleton-delay": `${delay}ms` }}
      />
    );
  }

  if (type === "stacked") {
    return (
      <span className="mov-skeletonStack">
        <SkeletonLine width={width} delay={delay} />
        <SkeletonLine
          width={Math.max(34, width - 18)}
          secondary
          delay={delay + 70}
        />
      </span>
    );
  }

  return <SkeletonLine width={width} delay={delay} />;
}

export default function GlobalTableSkeleton({
  actionCount = 2,
  columns = [],
  columnTypes = [],
  gridClassName = "",
  rows = 8,
}) {
  const rowCount = Math.min(30, Math.max(1, Math.floor(Number(rows) || 8)));
  const safeActionCount = Math.min(
    4,
    Math.max(1, Math.floor(Number(actionCount) || 2)),
  );

  return (
    <div className="mov-skeletonWrap" aria-hidden="true">
      {Array.from({ length: rowCount }, (_, rowIndex) => (
        <div
          className={`mov-gridTable mov-gridTable--row global-divTable__row entity-table-row mov-row--skeleton ${gridClassName}`.trim()}
          key={rowIndex}
          role="row"
        >
          {columns.map((column, columnIndex) => {
            const type =
              columnTypes[columnIndex] || inferCellType(column, columnIndex);
            const width = WIDTH_SEQUENCE[
              (rowIndex * 3 + columnIndex) % WIDTH_SEQUENCE.length
            ];
            return (
              <div
                className={`mov-gridCell${type === "actions" ? " is-center" : ""}`}
                key={columnIndex}
                role="cell"
              >
                <SkeletonCell
                  type={type}
                  width={width}
                  actionCount={safeActionCount}
                  delay={(rowIndex * 37 + columnIndex * 29) % 320}
                />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
