import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './index.css';

const container = document.getElementById('root');
if (!container) {
	throw new Error('index.html has no #root element');
}

createRoot(container).render(
	<StrictMode>
		<h1>Conversational Research Environment</h1>
	</StrictMode>,
);
