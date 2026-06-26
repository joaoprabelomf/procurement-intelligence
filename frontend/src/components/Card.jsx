export default function Card({ children, className = "", title, subtitle }) {
  return (
    <div className={`bg-white rounded-lg shadow-card px-5 py-4 ${className}`}>
      {title && (
        <div className="mb-3">
          <p className="text-sm font-semibold text-am-navy">{title}</p>
          {subtitle && <p className="text-xs text-am-text-secondary mt-0.5">{subtitle}</p>}
        </div>
      )}
      {children}
    </div>
  );
}
