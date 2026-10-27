import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { hasRole } from '../lib/roles'
import { writeSite } from '../lib/sites'
import demoHtml from './mr-terceiriza-demo.html?raw'

export function MrTerceirizaPage() {
  const { profile, signOut } = useAuth()
  const admin = hasRole(profile, 'admin')

  return (
    <div className="mr-demo">
      <header className="mr-demo-bar">
        <span>Empresas · demonstração</span>
        <div className="mr-demo-actions">
          {admin ? (
            <Link to="/" onClick={() => writeSite('nerites')}>
              Sistema Nerites
            </Link>
          ) : null}
          <button type="button" onClick={() => void signOut()}>
            Sair
          </button>
        </div>
      </header>
      <iframe
        className="mr-demo-frame"
        title="Empresas"
        srcDoc={demoHtml}
      />
    </div>
  )
}
