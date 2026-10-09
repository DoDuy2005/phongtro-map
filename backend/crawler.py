# Chạy crawler độc lập nếu cần:
# python crawler.py
from app.db import SessionLocal
from app.crawler_service import crawl_once

if __name__ == "__main__":
    db = SessionLocal()
    try:
        print(crawl_once(db, max_records=200))
    finally:
        db.close()
