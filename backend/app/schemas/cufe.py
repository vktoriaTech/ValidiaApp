from pydantic import BaseModel


class CufeValidateRequest(BaseModel):
    cufe: str
    nit_emisor: str
