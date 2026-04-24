"""app/api/router.py"""
from fastapi import APIRouter
from app.api.routes.alerts             import router as alerts_router
from app.api.routes.analysis           import router as analysis_router
from app.api.routes.automation         import router as automation_router
from app.api.routes.cv_matching        import router as cv_matching_router
from app.api.routes.cv_store           import router as cv_store_router
from app.api.routes.cvs                import router as cvs_router
from app.api.routes.dashboard          import router as dashboard_router
from app.api.routes.esco               import router as esco_router
from app.api.routes.history            import router as history_router
from app.api.routes.jobs               import router as jobs_router
from app.api.routes.job_analysis       import router as job_analysis_router
from app.api.routes.jobs_intelligence  import router as jobs_intelligence_router
from app.api.routes.profile            import router as profile_router
from app.api.routes.scrapers           import router as scrapers_router
from app.api.routes.settings           import router as settings_router

api_router = APIRouter(prefix="/api")
api_router.include_router(dashboard_router)
api_router.include_router(jobs_router)
api_router.include_router(job_analysis_router)
api_router.include_router(jobs_intelligence_router)
api_router.include_router(cvs_router)
api_router.include_router(scrapers_router)
api_router.include_router(analysis_router)
api_router.include_router(history_router)
api_router.include_router(profile_router)
api_router.include_router(cv_store_router)
api_router.include_router(cv_matching_router)
api_router.include_router(alerts_router)
api_router.include_router(esco_router)
api_router.include_router(automation_router)
api_router.include_router(settings_router)
