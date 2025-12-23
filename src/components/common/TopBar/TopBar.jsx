import './TopBar.css'
import Breadcrumb from '../Breadcrumb/Breadcrumb'

const TopBar = ({ breadcrumbItems }) => {
  return (
    <header className="topbar">
      {breadcrumbItems && <Breadcrumb items={breadcrumbItems} />}
    </header>
  );
};

export default TopBar;

