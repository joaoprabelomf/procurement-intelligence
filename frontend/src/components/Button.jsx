export default function Button({
  children,
  variant = "secondary",
  size = "md",
  icon: Icon,
  className = "",
  disabled = false,
  ...props
}) {
  const base = "inline-flex items-center gap-2 rounded-md font-medium transition disabled:opacity-50 disabled:cursor-not-allowed";
  const sizes = {
    sm: "text-xs px-3 py-1.5",
    md: "text-sm px-4 py-2",
  };
  const variants = {
    primary: "bg-am-navy text-white hover:bg-am-navy-light",
    accent: "bg-am-blue text-white hover:bg-am-navy",
    secondary: "bg-white text-am-navy border border-am-border hover:bg-am-bg",
    ghost: "text-am-blue hover:underline bg-transparent",
    danger: "bg-red-600 text-white hover:bg-red-700 border border-red-700",
  };

  return (
    <button
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {Icon && <Icon size={size === "sm" ? 14 : 16} />}
      {children}
    </button>
  );
}
