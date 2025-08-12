from pydantic import BaseModel, EmailStr

class RegisterIn(BaseModel):
    nome: str
    email: EmailStr
    cpf: str
    senha: str

class LoginIn(BaseModel):
    email: EmailStr
    senha: str

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
