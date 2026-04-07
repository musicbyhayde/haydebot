from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from datetime import datetime
from enum import Enum

class BaseSchema(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


class LeadStatus(str, Enum):
    NEW = "New"
    PROCESSING = "Processing"
    DISTRIBUTED = "Distributed"
    ASSIGNED = "Assigned"
    MANUAL = "Manual"
    CLOSED = "Closed"
    LOST = "Lost"
    QUOTE_SENT = "Quote_Sent"
    WAITING_PAYMENT = "Waiting_Payment"
    TALKING = "Talking"

class ConversationState(str, Enum):
    START = "START"
    AWAITING_SERVICE = "AWAITING_SERVICE"
    AWAITING_DATE = "AWAITING_DATE"
    AWAITING_LOCATION = "AWAITING_LOCATION"
    AWAITING_GUESTS = "AWAITING_GUESTS"
    COMPLETED = "COMPLETED"

class ServiceType(str, Enum):
    BOUZOUKI = "Bouzouki"
    BAND = "Band"
    DJ = "DJ"
    RECEPTION = "Reception"
    TALK = "Talk"
    OTHER = "Other"

class LeadBase(BaseSchema):
    phone: str = Field(..., alias="Phone")
    name: Optional[str] = Field(None, alias="Name")
    status: LeadStatus = Field(LeadStatus.NEW, alias="Status")
    conversation_state: ConversationState = Field(ConversationState.START, alias="Conversation_State")
    last_interaction: Optional[datetime] = Field(None, alias="Last_Interaction")
    service: Optional[ServiceType] = Field(None, alias="Service")
    event_date: Optional[str] = Field(None, alias="Event_Date") 
    location: Optional[str] = Field(None, alias="Location")
    guests: Optional[str] = Field(None, alias="Guests")
    bot_mute_until: Optional[datetime] = Field(None, alias="Bot_Mute_Until")
    last_summary: Optional[str] = Field(None, alias="Last_Summary")
    closing_amount: Optional[float] = Field(None, alias="Closing_Amount")
    lost_reason: Optional[str] = Field(None, alias="Lost_Reason")
    owner: Optional[str] = Field(None, alias="Owner")
    last_read_at: Optional[datetime] = Field(None, alias="Last_Read_At")
    starred_by: Optional[List[str]] = Field(default_factory=list, alias="Starred_By")

class LeadCreate(LeadBase):
    pass

class LeadUpdate(BaseSchema):
    name: Optional[str] = Field(None, alias="Name")
    status: Optional[LeadStatus] = Field(None, alias="Status")
    conversation_state: Optional[ConversationState] = Field(None, alias="Conversation_State")
    last_interaction: Optional[datetime] = Field(None, alias="Last_Interaction")
    service: Optional[ServiceType] = Field(None, alias="Service")
    event_date: Optional[str] = Field(None, alias="Event_Date")
    location: Optional[str] = Field(None, alias="Location")
    guests: Optional[str] = Field(None, alias="Guests")
    musician_assigned: Optional[List[str]] = Field(None, alias="Musician_Assigned") 
    bot_mute_until: Optional[datetime] = Field(None, alias="Bot_Mute_Until")
    last_summary: Optional[str] = Field(None, alias="Last_Summary")
    closing_amount: Optional[float] = Field(None, alias="Closing_Amount")
    lost_reason: Optional[str] = Field(None, alias="Lost_Reason")
    owner: Optional[str] = Field(None, alias="Owner")
    last_read_at: Optional[datetime] = Field(None, alias="Last_Read_At")
    starred_by: Optional[List[str]] = Field(None, alias="Starred_By")

class LeadResponse(LeadBase):
    id: str # Airtable Record ID
    created_at: Optional[datetime] = Field(None, alias="Created")
    musician_assigned: Optional[List[str]] = Field(default_factory=list, alias="Musician_Assigned")

class MusicianBase(BaseSchema):
    name: str = Field(..., alias="Name")
    phone: str = Field(..., alias="Phone")
    is_active: bool = Field(True, alias="Is_Active")
    score: int = Field(5, alias="Score")

class MusicianCreate(BaseSchema):
    name: str = Field(..., alias="Name")
    phone: str = Field(..., alias="Phone")
    is_active: bool = Field(True, alias="Is_Active")
    score: int = Field(5, alias="Score")

class MusicianUpdate(BaseSchema):
    name: Optional[str] = Field(None, alias="Name")
    phone: Optional[str] = Field(None, alias="Phone")
    is_active: Optional[bool] = Field(None, alias="Is_Active")
    score: Optional[int] = Field(None, alias="Score")

class MusicianResponse(MusicianBase):
    id: str

class MessageCreate(BaseSchema):
    lead: Optional[List[str]] = Field(None, alias="Lead") # Link to Lead Record ID
    musician: Optional[List[str]] = Field(None, alias="Musician") # Link to Musician Record ID
    direction: str = Field(..., alias="Direction") # Inbound/Outbound
    content: str = Field(..., alias="Content")
    media_url: Optional[str] = Field(None, alias="Media_URL")
    media_type: Optional[str] = Field(None, alias="Media_Type")
    timestamp: datetime = Field(..., alias="Timestamp")
    status: str = Field("Sent", alias="Status")
    id: Optional[str] = Field(None, alias="ID") # Was WhatsApp_ID


class NoteCreate(BaseSchema):
    lead_id: str = Field(..., alias="Lead_ID")
    author: str = Field(..., alias="Author")
    content: str = Field(..., alias="Content")
    file_url: Optional[str] = Field(None, alias="File_URL")
    file_name: Optional[str] = Field(None, alias="File_Name")

class NoteUpdate(BaseSchema):
    content: Optional[str] = Field(None, alias="Content")


class FinanceEntryCreate(BaseSchema):
    owner: str = Field(..., alias="Owner")
    entry_type: str = Field(..., alias="Type")  # income / expense
    date: str = Field(..., alias="Date")
    description: str = Field(..., alias="Description")
    event_name: Optional[str] = Field(None, alias="Event_Name")
    musician: Optional[str] = Field(None, alias="Musician")
    amount: float = Field(..., alias="Amount")
    payment_status: str = Field("לא שולם", alias="Payment_Status")
    payment_method: str = Field("חשבון", alias="Payment_Method")
    lead_id: Optional[str] = Field(None, alias="Lead_ID")


class FinanceEntryUpdate(BaseSchema):
    entry_type: Optional[str] = Field(None, alias="Type")
    date: Optional[str] = Field(None, alias="Date")
    description: Optional[str] = Field(None, alias="Description")
    event_name: Optional[str] = Field(None, alias="Event_Name")
    musician: Optional[str] = Field(None, alias="Musician")
    amount: Optional[float] = Field(None, alias="Amount")
    payment_status: Optional[str] = Field(None, alias="Payment_Status")
    payment_method: Optional[str] = Field(None, alias="Payment_Method")

class TaskCreate(BaseSchema):
    title: str = Field(..., alias="Title")
    assignee: Optional[str] = Field(None, alias="Assignee") # 'אילן' or 'קובי'
    due_date: Optional[str] = Field(None, alias="Due_Date")
    is_completed: bool = Field(False, alias="Is_Completed")
    lead_id: Optional[str] = Field(None, alias="Lead_ID")
    starred_by: Optional[List[str]] = Field(default_factory=list, alias="Starred_By")

class TaskUpdate(BaseSchema):
    title: Optional[str] = Field(None, alias="Title")
    assignee: Optional[str] = Field(None, alias="Assignee")
    due_date: Optional[str] = Field(None, alias="Due_Date")
    is_completed: Optional[bool] = Field(None, alias="Is_Completed")
    lead_id: Optional[str] = Field(None, alias="Lead_ID")
    starred_by: Optional[List[str]] = Field(None, alias="Starred_By")

class ActivityCreate(BaseModel):
    actor: str
    action_type: str
    description: str
    lead_id: Optional[str] = None

class VideoBase(BaseSchema):
    label: str = Field(..., alias="Label")
    url: str = Field(..., alias="URL")
    category: Optional[str] = Field(None, alias="Category")
    is_active: bool = Field(True, alias="Is_Active")

class VideoCreate(VideoBase):
    pass

class VideoUpdate(BaseSchema):
    label: Optional[str] = Field(None, alias="Label")
    url: Optional[str] = Field(None, alias="URL")
    category: Optional[str] = Field(None, alias="Category")
    is_active: Optional[bool] = Field(None, alias="Is_Active")
