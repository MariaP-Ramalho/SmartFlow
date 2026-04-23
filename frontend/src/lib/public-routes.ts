const PUBLIC_ROUTES = ["/login", "/register"] as const;

export function isPublicPath(pathname: string | null): boolean {
  if (!pathname) return false;
  const p =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;
  return (PUBLIC_ROUTES as readonly string[]).includes(p);
}
