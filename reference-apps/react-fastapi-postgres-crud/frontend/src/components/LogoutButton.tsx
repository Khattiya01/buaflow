import { useNavigate } from "react-router-dom";

import { logout } from "../api/client.ts";

export default function LogoutButton() {
  const navigate = useNavigate();

  async function handleClick() {
    await logout();
    navigate("/login");
  }

  return (
    <button type="button" onClick={handleClick}>
      Sign out
    </button>
  );
}
