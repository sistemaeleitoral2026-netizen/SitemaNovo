import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { hasRole } from '../lib/roles'
import { writeSite } from '../lib/sites'

export function AssessoriaMbPage() {
  const { profile, signOut } = useAuth()
  const admin = hasRole(profile, 'admin')

  return (
    <div className="mr-demo">
      <header className="mr-demo-bar">
        <span>Assessoria MB</span>
        <div className="mr-demo-actions">
          {admin ? (
            <>
              <Link to="/" onClick={() => writeSite('nerites')}>Sistema Nerites</Link>
              <Link to="/mr-terceiriza" onClick={() => writeSite('mr-terceiriza')}>Empresas</Link>
            </>
          ) : null}
          <button type="button" onClick={() => void signOut()}>Sair</button>
        </div>
      </header>
      <iframe className="mr-demo-frame" title="Assessoria MB" src="/assessoria-mb/index.html" />
    </div>
  )
}
