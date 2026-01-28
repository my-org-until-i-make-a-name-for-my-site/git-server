import Header from '../components/Header'

function Repository({ user, logout }) {
  return (
    <div>
      <Header user={user} logout={logout} />
      <div className="container">
        <h2>Repository Page</h2>
      </div>
    </div>
  )
}

export default Repository
