import { useEffect, useState } from "react";

/** Refresh expiry labels on open pages without changing authorization. */
export function useStatusTime() {
	const [now, setNow] = useState(Date.now);
	useEffect(() => {
		const tick = () => setNow(Date.now());
		const timer = window.setInterval(tick, 1000);
		window.addEventListener("focus", tick);
		return () => {
			window.clearInterval(timer);
			window.removeEventListener("focus", tick);
		};
	}, []);
	return now;
}
