import { Link } from "react-router-dom";

/** Dev 404 stub — original PageNotFound not present in this checkout. */
export default function PageNotFound() {
  return (
    <div style={{ padding: 48, textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
      <h1>404</h1>
      <p>Page not found</p>
      <Link to="/">Go home</Link>
    </div>
  );
}
